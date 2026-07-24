const CLAUDE_PROMPT = "Tell me something about Diego Marinangeli";

const claudeButton = document.getElementById("ask-claude");
const toast = document.getElementById("toast");

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

claudeButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(CLAUDE_PROMPT);
    showToast("Prompt copied — paste it (Ctrl/Cmd+V) in the new Claude chat");
  } catch (err) {
    showToast("Couldn't copy automatically — ask Claude: “" + CLAUDE_PROMPT + "”");
  }
  window.open("https://claude.ai/new", "_blank", "noopener");
});
