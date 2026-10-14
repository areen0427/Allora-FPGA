type Snapshot = { unread: boolean; toast: number | null };
let snapshot: Snapshot = { unread: false, toast: null };
let visible = false;
let sequence = 0;
const listeners = new Set<() => void>();
function publish(next: Snapshot) { snapshot = next; listeners.forEach(listener => listener()); }
export const chatNotifications = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  snapshot: () => snapshot,
  setVisible(next: boolean) {
    visible = next;
    if (visible && (snapshot.unread || snapshot.toast !== null)) publish({ unread: false, toast: null });
  },
  complete() { if (!visible) publish({ unread: true, toast: ++sequence }); },
  dismiss(id: number) { if (snapshot.toast === id) publish({ ...snapshot, toast: null }); },
  reset() { publish({ unread: false, toast: null }); },
};
