import { useContext } from 'react';
import { PriceContext } from '../context/PriceContext';

export const usePrices = () => useContext(PriceContext);
