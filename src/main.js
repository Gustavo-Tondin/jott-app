import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { boot } from "./lib/services/locale.js";

// The dictionary goes over the strings before anything reads them. Chained,
// not awaited at top level: Vite's default target does not allow that.
boot().then(() => mount(App, { target: document.getElementById("app") }));
