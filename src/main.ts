import "./ui/styles.css";
import { Controller } from "@/ui/controller";

const app = document.getElementById("app");
if (app) {
  const ctrl = new Controller(app);
  ctrl.newGame();
}
