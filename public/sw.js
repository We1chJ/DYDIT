/*
 * Service worker for reminders.
 *
 * This is the only part of the app that runs when no tab is open. The browser
 * wakes it when a push arrives, it draws the notification, and it goes back to
 * sleep. It deliberately holds no state and reads nothing from the page.
 */

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every old tab to close;
  // there is no old version whose behaviour we need to preserve.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  // A push with no body still has to show something: the push contract says a
  // woken worker must display a notification, and a silent wake is a spec
  // violation browsers eventually punish by revoking the subscription.
  let payload = { title: "DYDIT", body: "Something is still waiting." };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      // Collapses with any earlier unread reminder rather than stacking up a
      // column of them if the machine was asleep.
      tag: payload.tag || "dydit-reminder",
      renotify: false,
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
      // Focus an existing tab if one is already open, rather than piling up a
      // new window every time a reminder is clicked.
      for (const tab of tabs) {
        if (tab.url === target && "focus" in tab) return tab.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
