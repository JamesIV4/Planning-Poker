import { HashRouter, Routes, Route } from "react-router-dom";
import { CreateSessionPage } from "./pages/CreateSessionPage";
import { SessionPage } from "./pages/SessionPage";
import "./App.css";

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<CreateSessionPage />} />
        <Route path="/session/:sessionId" element={<SessionPage />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
