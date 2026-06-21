import { render } from 'preact';
import '@/styles/global.css';
import { Settings } from './Settings';

render(<Settings />, document.getElementById('app')!);
