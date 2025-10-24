// src/runtime.ts
function init(selector = "[ps-data]") {
  if (typeof window !== "undefined") {
    console.log("petite-svelte: init", selector);
  }
}
export {
  init
};
