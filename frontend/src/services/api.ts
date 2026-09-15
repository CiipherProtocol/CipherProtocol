import axios from 'axios';
import { API_URL } from '../constants/config';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
