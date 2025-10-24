export function init(selector: string = "[ps-data]") {
  if (typeof window !== "undefined") {
    console.log("petite-svelte: init", selector);
  }
}
