function showSection(section) {
  const content = document.getElementById("content");

  if (section === "students") {
    content.innerHTML = "<h2>Students</h2><p>Student list will be displayed here.</p>";
  } else if (section === "analytics") {
    content.innerHTML = "<h2>Analytics</h2><p>Engagement analytics will be shown here.</p>";
  } else if (section === "alerts") {
    content.innerHTML = "<h2>Alerts</h2><p>Reminders and alerts will be shown here.</p>";
  } else if (section === "settings") {
    content.innerHTML = "<h2>Settings</h2><p>System settings will be shown here.</p>";
  }
}
