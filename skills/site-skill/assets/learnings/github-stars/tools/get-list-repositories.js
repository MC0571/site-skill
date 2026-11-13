import { getStars, validateStarsUrl } from "./get-stars.js";

export async function getListRepositories(ctx, args = {}) {
  if (args.url === undefined || args.url === null || args.url === "") {
    throw new Error("url must be a GitHub List detail URL");
  }
  let validated;
  try {
    validated = validateStarsUrl(args.url);
  } catch {
    throw new Error("url must be a GitHub List detail URL");
  }
  if (validated.layout !== "list") throw new Error("url must be a GitHub List detail URL");
  return getStars(ctx, args);
}
