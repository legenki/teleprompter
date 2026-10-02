// Firefox: toolbar button toggles the sidebar (must run inside the click handler).
chrome.action.onClicked.addListener(() => {
  browser.sidebarAction.toggle();
});
