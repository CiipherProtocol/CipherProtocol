import { Token } from '../types/token';

export const SUPPORTED_TOKENS: Token[] = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    contractAddress: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
    decimals: 7,
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    contractAddress: 'CAP5AMC2OTY7YSNUCG4EY7EXPCXFQMK2WGOOFOMVNC5OBK3F4SOOFEQ2',
    decimals: 7,
  },
  {
    symbol: 'XLM',
    name: 'Stellar Lumens',
    contractAddress: 'CAS3J7GYLGXMF6TDJBWV2X7SEMFKQGZLW2IFYZKV2BJMSIVKKOLWJDGL',
    decimals: 7,
  },
];

export const getTokenBySymbol = (symbol: string): Token | undefined =>
  SUPPORTED_TOKENS.find((t) => t.symbol === symbol);
