import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import './App.css';

/**
 * Root application component
 * Note: Auth0Provider is in main.tsx wrapping the router
 */
function App() {
  return <RouterProvider router={router} />;
}

export default App;
