import { githubProvider } from "./github.js";
import { googleProvider } from "./google.js";

export const providerRegistry = {
  github: githubProvider,
  google: googleProvider,
};
