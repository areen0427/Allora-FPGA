import { createElement } from "react";
import { createRoot } from "react-dom/client";
import Fixture from "./BoardResourcesFixture";
createRoot(document.getElementById("root")!).render(createElement(Fixture));
