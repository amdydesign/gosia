<?php
/**
 * Shared helpers for attachment endpoints
 */

const ATTACHMENTS_MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const ATTACHMENTS_ALLOWED = [
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'gif' => 'image/gif',
    'webp' => 'image/webp',
    'heic' => 'image/heic',
    'pdf' => 'application/pdf',
    'doc' => 'application/msword',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls' => 'application/vnd.ms-excel',
    'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'txt' => 'text/plain',
    'csv' => 'text/csv',
    'zip' => 'application/zip',
];

function attachmentsUploadDir()
{
    return __DIR__ . '/../uploads';
}

/**
 * Validate entity type and confirm the entity belongs to the user.
 * Returns normalized entity type or sends an error response.
 */
function attachmentsCheckEntity(PDO $conn, $userId, $entityType, $entityId)
{
    $tables = [
        'collaboration' => 'collaborations',
        'purchase' => 'purchases',
    ];

    if (!isset($tables[$entityType])) {
        Response::validationError(['entity_type' => 'Must be "collaboration" or "purchase"']);
    }
    if ($entityId <= 0) {
        Response::validationError(['entity_id' => 'Valid entity id required']);
    }

    $stmt = $conn->prepare("SELECT id FROM {$tables[$entityType]} WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $entityId, 'user_id' => $userId]);
    if (!$stmt->fetch()) {
        Response::notFound('Record not found');
    }

    return $entityType;
}
