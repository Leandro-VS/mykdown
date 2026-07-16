self.mykdownPlugin = {
  render(code) {
    const escaped = code.replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[character],
    );
    return `<aside style="padding: 14px 16px; border-left: 3px solid #6fb3a0; background: rgba(111,179,160,.1)">${escaped}</aside>`;
  },
};
