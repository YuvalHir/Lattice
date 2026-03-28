/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";
import { initializeApp } from "./init";

// Initialize the IPC listeners before mounting the UI
initializeApp().catch(console.error);

render(() => <App />, document.getElementById("root") as HTMLElement);
