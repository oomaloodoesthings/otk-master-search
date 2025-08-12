// Updated app.js
function setLoader(visible) {
  document.getElementById('loader-overlay').style.display = visible ? 'flex' : 'none';
}
function setLoadStatus(text) {
  document.getElementById('loader-status').innerText = text;
}
// Example: loading simulation
let loadedItems = 0;
const totalItems = 100;
setLoader(true);
const loadInterval = setInterval(() => {
  loadedItems += 5;
  setLoadStatus(`Loaded ${loadedItems} item(s)`);
  if (loadedItems >= totalItems) {
    clearInterval(loadInterval);
    setLoader(false);
  }
}, 200);
