import { useSession } from "./auth/SessionContext";
import { LoginPage } from "./pages/LoginPage";
import { RepresentativesPage } from "./pages/RepresentativesPage";

export function App() {
  const { state } = useSession();
  return state === "loggedIn" ? <RepresentativesPage /> : <LoginPage />;
}
