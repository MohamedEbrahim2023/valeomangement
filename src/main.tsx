import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installMobileApiBridge } from './lib/mobile-api-bridge.ts';

installMobileApiBridge();

createRoot(document.getElementById('root')!).render(<App />);

