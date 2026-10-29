import { apiRequest } from '../utils/api';
import { setPublished } from './agenda';

/**
 * One thing from the brief made (delta 1) or undone (-1).
 * @return {{ deliverables: object[], auto_published: boolean }} - the last one made marks the job published
 */
export function tickDeliverable(collabId, index, delta = 1) {
    return apiRequest(`/collaborations/update.php?id=${collabId}`, 'PUT', { tick: { index, delta } });
}


/**
 * "Zrobione" with a "Cofnij" toast. onChange({ deliverables, published }) after the tick and after an undo
 * (published: true = the last one marked the job published, false = undone, undefined = unchanged).
 */
export async function tickWithUndo(toast, collab, index, onChange) {
    const res = await tickDeliverable(collab.id, index, 1);
    onChange({ deliverables: res.deliverables, published: res.auto_published ? true : undefined });
    const d = res.deliverables[index];
    const message = res.auto_published
        ? `${collab.brand}: wszystko zrobione — termin płatności liczy się od dziś`
        : `${d.label} — zrobione ${d.done}/${d.count}`;
    toast.success(message, {
        duration: 6000,
        action: {
            label: 'Cofnij',
            onClick: async () => {
                try {
                    const back = await tickDeliverable(collab.id, index, -1);
                    if (res.auto_published) await setPublished(collab.id, false);
                    onChange({ deliverables: back.deliverables, published: res.auto_published ? false : undefined });
                } catch (err) {
                    toast.error(err.message || 'Nie udało się cofnąć');
                }
            },
        },
    });
}
