<?php
/**
 * Kosz: deleting never asks "Czy na pewno?" - the thing moves here for 30 days
 * and "Cofnij" (or Ustawienia -> Kosz) puts it back.
 *
 * The row and its children are kept as JSON, files stay on disk until the purge.
 * Restoring re-inserts them with the same ids (a new id only if that one got taken).
 */

require_once __DIR__ . '/../config/Schema.php';

class Trash
{
    const DAYS = 30;

    const TYPES = [
        'collaboration' => 'collaborations',
        'purchase' => 'purchases',
        'idea' => 'ideas',
        'document' => 'documents',
        'attachment' => 'attachments',
        'share' => 'shares',
    ];

    /**
     * Move a thing to the bin. @return int|null trash id (null when not found)
     */
    public static function put(PDO $conn, $userId, $type, $id)
    {
        Schema::ensure($conn, 'trash');
        $table = self::TYPES[$type] ?? null;
        if (!$table) {
            return null;
        }
        $stmt = $conn->prepare("SELECT * FROM `$table` WHERE id = :id AND user_id = :user_id");
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        $children = [];
        $files = [];
        if ($type === 'collaboration' || $type === 'purchase') {
            $children['attachments'] = self::attachmentsOf($conn, $userId, $type, $id);
            foreach ($children['attachments'] as $a) {
                $files[] = 'attachments/' . $a['stored_name'];
            }
        }
        if ($type === 'collaboration') {
            $team = $conn->prepare("SELECT * FROM collaboration_team WHERE collaboration_id = :id");
            $team->execute(['id' => $id]);
            $children['team'] = $team->fetchAll(PDO::FETCH_ASSOC);
            $children['documents'] = self::linkedDocuments($conn, $userId, $id);
        }
        if ($type === 'document') {
            $files[] = 'documents/' . $row['stored_name'];
        }
        if ($type === 'attachment') {
            $files[] = 'attachments/' . $row['stored_name'];
        }
        if ($type === 'share') {
            // the link stops working right away; the file stays until the purge ("Cofnij" brings the same link back)
            $files[] = 'share/' . $row['stored_name'];
            if (!empty($row['poster_name'])) {
                $files[] = 'share/' . $row['poster_name'];
            }
        }

        $conn->beginTransaction();
        try {
            $conn->prepare("
                INSERT INTO trash (user_id, entity_type, entity_id, title, payload, files, deleted_at)
                VALUES (:user_id, :type, :entity_id, :title, :payload, :files, :at)
            ")->execute([
                'user_id' => $userId,
                'type' => $type,
                'entity_id' => $id,
                'title' => mb_substr(self::title($type, $row), 0, 255),
                'payload' => json_encode(['row' => $row, 'children' => $children], JSON_UNESCAPED_UNICODE),
                'files' => json_encode($files),
                'at' => date('Y-m-d H:i:s'),
            ]);
            $trashId = (int) $conn->lastInsertId();

            if (!empty($children['attachments'])) {
                $conn->prepare("DELETE FROM attachments WHERE user_id = :user_id AND entity_type = :type AND entity_id = :id")
                    ->execute(['user_id' => $userId, 'type' => $type, 'id' => $id]);
            }
            if (!empty($children['documents'])) {
                $conn->prepare("UPDATE documents SET collaboration_id = NULL WHERE user_id = :user_id AND collaboration_id = :id")
                    ->execute(['user_id' => $userId, 'id' => $id]);
            }
            // collaboration_team goes with the collaboration (ON DELETE CASCADE)
            $conn->prepare("DELETE FROM `$table` WHERE id = :id AND user_id = :user_id")->execute(['id' => $id, 'user_id' => $userId]);
            $conn->commit();
        } catch (Exception $e) {
            $conn->rollBack();
            throw $e;
        }
        return $trashId;
    }

    /** Put it back. @return array|null ['type' => ..., 'id' => new id] */
    public static function restore(PDO $conn, $userId, $trashId)
    {
        Schema::ensure($conn, 'trash');
        $stmt = $conn->prepare("SELECT * FROM trash WHERE id = :id AND user_id = :user_id");
        $stmt->execute(['id' => $trashId, 'user_id' => $userId]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$item) {
            return null;
        }
        $type = $item['entity_type'];
        $table = self::TYPES[$type];
        $payload = json_decode($item['payload'], true);
        $row = $payload['row'];
        $children = $payload['children'] ?? [];

        $conn->beginTransaction();
        try {
            $newId = self::insert($conn, $table, $row);
            foreach ($children['team'] ?? [] as $member) {
                unset($member['id']);
                $member['collaboration_id'] = $newId;
                self::insert($conn, 'collaboration_team', $member);
            }
            foreach ($children['attachments'] ?? [] as $attachment) {
                $attachment['entity_id'] = $newId;
                self::insert($conn, 'attachments', $attachment);
            }
            if (!empty($children['documents'])) {
                $placeholders = implode(',', array_fill(0, count($children['documents']), '?'));
                $conn->prepare("UPDATE documents SET collaboration_id = ? WHERE user_id = ? AND collaboration_id IS NULL AND id IN ($placeholders)")
                    ->execute(array_merge([$newId, $userId], array_map('intval', $children['documents'])));
            }
            $conn->prepare("DELETE FROM trash WHERE id = :id")->execute(['id' => $trashId]);
            $conn->commit();
        } catch (Exception $e) {
            $conn->rollBack();
            throw $e;
        }
        return ['type' => $type, 'id' => $newId];
    }

    /** What is in the bin (newest first) with days left. */
    public static function items(PDO $conn, $userId)
    {
        Schema::ensure($conn, 'trash');
        $stmt = $conn->prepare("
            SELECT id, entity_type, entity_id, title, deleted_at,
                   GREATEST(0, " . self::DAYS . " - DATEDIFF(CURDATE(), DATE(deleted_at))) AS days_left
            FROM trash WHERE user_id = :user_id ORDER BY deleted_at DESC LIMIT 200
        ");
        $stmt->execute(['user_id' => $userId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /** Older than 30 days: gone for good, files too. */
    public static function purge(PDO $conn)
    {
        Schema::ensure($conn, 'trash');
        $old = $conn->query("SELECT id, files FROM trash WHERE deleted_at < DATE_SUB(NOW(), INTERVAL " . self::DAYS . " DAY)")->fetchAll(PDO::FETCH_ASSOC);
        $uploads = realpath(__DIR__ . '/../uploads');
        foreach ($old as $item) {
            foreach (json_decode((string) $item['files'], true) ?: [] as $file) {
                $path = realpath($uploads . '/' . $file);
                // only files inside uploads/ (never follow a path out of it)
                if ($path && $uploads && strpos($path, $uploads . DIRECTORY_SEPARATOR) === 0 && is_file($path)) {
                    @unlink($path);
                }
            }
            $conn->prepare("DELETE FROM trash WHERE id = :id")->execute(['id' => $item['id']]);
        }
        return count($old);
    }

    private static function attachmentsOf(PDO $conn, $userId, $type, $id)
    {
        try {
            Schema::ensure($conn, 'attachments');
            $stmt = $conn->prepare("SELECT * FROM attachments WHERE user_id = :user_id AND entity_type = :type AND entity_id = :id");
            $stmt->execute(['user_id' => $userId, 'type' => $type, 'id' => $id]);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Exception $e) {
            return [];
        }
    }

    private static function linkedDocuments(PDO $conn, $userId, $collabId)
    {
        try {
            $stmt = $conn->prepare("SELECT id FROM documents WHERE user_id = :user_id AND collaboration_id = :id");
            $stmt->execute(['user_id' => $userId, 'id' => $collabId]);
            return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
        } catch (Exception $e) {
            return []; // no documents table / column yet
        }
    }

    /** Insert a saved row; keeps its id unless taken. Only columns the table still has. */
    private static function insert(PDO $conn, $table, array $row)
    {
        $columns = array_column($conn->query("SHOW COLUMNS FROM `$table`")->fetchAll(PDO::FETCH_ASSOC), 'Field');
        $row = array_intersect_key($row, array_flip($columns));
        if (isset($row['id'])) {
            $taken = $conn->prepare("SELECT 1 FROM `$table` WHERE id = :id");
            $taken->execute(['id' => $row['id']]);
            if ($taken->fetchColumn()) {
                unset($row['id']);
            }
        }
        $names = array_keys($row);
        $sql = "INSERT INTO `$table` (`" . implode('`, `', $names) . "`) VALUES (" . implode(', ', array_fill(0, count($names), '?')) . ")";
        $conn->prepare($sql)->execute(array_values($row));
        return isset($row['id']) ? (int) $row['id'] : (int) $conn->lastInsertId();
    }

    private static function title($type, array $row)
    {
        switch ($type) {
            case 'collaboration':
                return trim($row['brand'] . ' · ' . number_format((float) $row['amount_gross'], 0, ',', ' ') . ' zł');
            case 'purchase':
                return trim($row['store'] . ' · ' . $row['items']);
            case 'attachment':
                return $row['original_name'];
            default:
                return (string) $row['title'];
        }
    }
}
