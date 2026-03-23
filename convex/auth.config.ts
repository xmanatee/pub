import { getSiteUrl } from "./env";

export default {
  providers: [
    {
      domain: getSiteUrl(),
      applicationID: "convex",
    },
  ],
};
