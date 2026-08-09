const copyButton = document.querySelector("[data-copy-command]");

if (copyButton) {
  const command = copyButton.parentElement.querySelector("code").textContent.trim();
  const label = copyButton.querySelector("[data-copy-label]");

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(command);
      label.textContent = "Copied";
      copyButton.setAttribute("aria-label", "Command copied");
    } catch {
      label.textContent = "Select command";
    }

    window.setTimeout(() => {
      label.textContent = "Copy";
      copyButton.removeAttribute("aria-label");
    }, 1800);
  });
}
