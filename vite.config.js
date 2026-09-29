import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { createHighscoreMiddleware } from "./server/highscores.js";

const highscoresFile = fileURLToPath(
  new URL("./data/highscores.json", import.meta.url),
);

function highscoreApi() {
  const middleware = createHighscoreMiddleware(highscoresFile);
  return {
    name: "highscore-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [highscoreApi()],
  server: {
    watch: {
      ignored: ["**/data/**"],
    },
  },
});
