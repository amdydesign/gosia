/**
 * Kosz: deleted things stay 30 days (api/utils/Trash.php).
 */
import { apiRequest } from '../utils/api';

export function listTrash() {
    return apiRequest('/trash/index.php');
}

export function restoreFromTrash(trashId) {
    return apiRequest(`/trash/index.php?restore=${trashId}`, 'POST', {});
}

/** Gone for good now (files too) - "Opróżnij kosz" / "Usuń na zawsze". */
export function discardFromTrash(ids) {
    return apiRequest('/trash/index.php', 'DELETE', { ids });
}

/** Toast after deleting: "Usunięte" + "Cofnij" (puts it back from the bin). */
export function deletedToast(toast, label, trashId, onRestored) {
    toast.success(label, {
        duration: 6000,
        action: trashId
            ? {
                  label: 'Cofnij',
                  onClick: async () => {
                      try {
                          const res = await restoreFromTrash(trashId);
                          onRestored?.(res);
                      } catch (err) {
                          toast.error(err.message || 'Nie udało się przywrócić');
                      }
                  },
              }
            : undefined,
    });
}
