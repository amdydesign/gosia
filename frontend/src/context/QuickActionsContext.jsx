import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import CollabFormSheet from '../components/collaborations/CollabFormSheet';
import PurchaseAddSheet from '../components/purchases/PurchaseAddSheet';
import QuickAddSheet from '../components/layout/QuickAddSheet';
import AiSettingsSheet from '../components/settings/AiSettingsSheet';

const QuickActionsContext = createContext(null);

/**
 * Global "add" flows available from every screen (FAB, Start tiles, lists):
 *   openCollab({ id?, prefill?, onSaved? }) - quick add / edit collaboration sheet
 *                                     (onSaved gets the collaboration id)
 *   openPurchase({ files?, manual?, prefill? }) - purchase from screenshot (or manual form)
 *   openQuickAdd()                  - "what do you want to add?" chooser
 *   openAiSettings()                - enter the AI key for screenshot reading
 * `versions` change after every save so lists know when to reload.
 */
export function QuickActionsProvider({ children }) {
    const [collab, setCollab] = useState(null);
    const [purchase, setPurchase] = useState(null);
    const [chooserOpen, setChooserOpen] = useState(false);
    const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
    const [versions, setVersions] = useState({ collaborations: 0, purchases: 0 });

    const bump = useCallback((entity) => {
        setVersions((v) => ({ ...v, [entity]: (v[entity] || 0) + 1 }));
    }, []);

    const openCollab = useCallback((opts = {}) => {
        setChooserOpen(false);
        setCollab({ key: Date.now(), ...opts });
    }, []);

    const openPurchase = useCallback((opts = {}) => {
        setChooserOpen(false);
        setPurchase({ key: Date.now(), ...opts });
    }, []);

    const openQuickAdd = useCallback(() => setChooserOpen(true), []);
    const openAiSettings = useCallback(() => setAiSettingsOpen(true), []);

    const value = useMemo(
        () => ({ openCollab, openPurchase, openQuickAdd, openAiSettings, versions, bump }),
        [openCollab, openPurchase, openQuickAdd, openAiSettings, versions, bump]
    );

    return (
        <QuickActionsContext.Provider value={value}>
            {children}
            <QuickAddSheet open={chooserOpen} onClose={() => setChooserOpen(false)} />
            {collab && (
                <CollabFormSheet
                    key={collab.key}
                    collabId={collab.id}
                    prefill={collab.prefill}
                    onClose={() => setCollab(null)}
                    onSaved={(id) => {
                        bump('collaborations');
                        collab.onSaved?.(id);
                    }}
                />
            )}
            {purchase && (
                <PurchaseAddSheet
                    key={purchase.key}
                    initialFiles={purchase.files}
                    manual={purchase.manual}
                    prefill={purchase.prefill}
                    onClose={() => setPurchase(null)}
                    onSaved={() => bump('purchases')}
                />
            )}
            {aiSettingsOpen && <AiSettingsSheet onClose={() => setAiSettingsOpen(false)} />}
        </QuickActionsContext.Provider>
    );
}

export function useQuickActions() {
    const ctx = useContext(QuickActionsContext);
    if (!ctx) throw new Error('useQuickActions must be used within QuickActionsProvider');
    return ctx;
}
