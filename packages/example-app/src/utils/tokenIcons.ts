// Token icon URLs mapping
// Uses CoinGecko as primary source (most reliable)

// Primary token icons
const TOKEN_ICONS: Record<string, string> = {
  // Native chain tokens
  SOL: 'https://assets.coingecko.com/coins/images/4128/standard/solana.png',
  ETH: 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png',
  BTC: 'https://assets.coingecko.com/coins/images/1/standard/bitcoin.png',
  NEAR: 'https://assets.coingecko.com/coins/images/10365/standard/near.jpg',
  TON: 'https://assets.coingecko.com/coins/images/17980/standard/ton_symbol.png',
  DOGE: 'https://assets.coingecko.com/coins/images/5/standard/dogecoin.png',
  XRP: 'https://assets.coingecko.com/coins/images/44/standard/xrp-symbol-white-128.png',
  ZEC: 'https://assets.coingecko.com/coins/images/486/standard/circle-zcash-color.png',
  BNB: 'https://assets.coingecko.com/coins/images/825/standard/bnb-icon2_2x.png',
  MATIC: 'https://assets.coingecko.com/coins/images/4713/standard/polygon.png',
  POL: 'https://assets.coingecko.com/coins/images/4713/standard/polygon.png',
  TRX: 'https://assets.coingecko.com/coins/images/1094/standard/tron-logo.png',
  SUI: 'https://assets.coingecko.com/coins/images/26375/standard/sui-ocean-square.png',
  AVAX: 'https://assets.coingecko.com/coins/images/12559/standard/Avalanche_Circle_RedWhite_Trans.png',
  ADA: 'https://assets.coingecko.com/coins/images/975/standard/cardano.png',
  LTC: 'https://assets.coingecko.com/coins/images/2/standard/litecoin.png',
  BCH: 'https://assets.coingecko.com/coins/images/780/standard/bitcoin-cash-circle.png',
  XLM: 'https://assets.coingecko.com/coins/images/100/standard/Stellar_symbol_black_RGB.png',
  ATOM: 'https://assets.coingecko.com/coins/images/1481/standard/cosmos_hub.png',
  DOT: 'https://assets.coingecko.com/coins/images/12171/standard/polkadot.png',
  FIL: 'https://assets.coingecko.com/coins/images/12817/standard/filecoin.png',
  APT: 'https://assets.coingecko.com/coins/images/26455/standard/aptos_round.png',
  SEI: 'https://assets.coingecko.com/coins/images/28205/standard/Sei_Logo_-_Transparent.png',

  // Stablecoins
  USDC: 'https://assets.coingecko.com/coins/images/6319/standard/usdc.png',
  USDT: 'https://assets.coingecko.com/coins/images/325/standard/Tether.png',
  DAI: 'https://assets.coingecko.com/coins/images/9956/standard/Badge_Dai.png',
  BUSD: 'https://assets.coingecko.com/coins/images/9576/standard/BUSD.png',
  PYUSD: 'https://assets.coingecko.com/coins/images/31212/standard/PYUSD_Logo_%282%29.png',
  EURC: 'https://assets.coingecko.com/coins/images/26045/standard/euro-coin.png',
  TUSD: 'https://assets.coingecko.com/coins/images/3449/standard/tusd.png',
  FRAX: 'https://assets.coingecko.com/coins/images/13422/standard/FRAX_icon.png',
  USDP: 'https://assets.coingecko.com/coins/images/6013/standard/Pax_Dollar.png',
  GUSD: 'https://assets.coingecko.com/coins/images/5992/standard/gemini-dollar-gusd.png',
  LUSD: 'https://assets.coingecko.com/coins/images/14666/standard/Group_3.png',
  crvUSD: 'https://assets.coingecko.com/coins/images/30118/standard/0xf939e0a03fb07f59a73314e73794be0e57ac1b4e.png',
  FDUSD: 'https://assets.coingecko.com/coins/images/31079/standard/firstfigital.jpeg',
  USDe: 'https://assets.coingecko.com/coins/images/33613/standard/USDE.png',

  // Wrapped tokens
  WBTC: 'https://assets.coingecko.com/coins/images/7598/standard/wrapped_bitcoin_wbtc.png',
  WETH: 'https://assets.coingecko.com/coins/images/2518/standard/weth.png',
  WSOL: 'https://assets.coingecko.com/coins/images/4128/standard/solana.png',
  WBNB: 'https://assets.coingecko.com/coins/images/825/standard/bnb-icon2_2x.png',
  WMATIC: 'https://assets.coingecko.com/coins/images/4713/standard/polygon.png',
  WAVAX: 'https://assets.coingecko.com/coins/images/12559/standard/Avalanche_Circle_RedWhite_Trans.png',
  stETH: 'https://assets.coingecko.com/coins/images/13442/standard/steth_logo.png',
  wstETH: 'https://assets.coingecko.com/coins/images/18834/standard/wstETH.png',
  rETH: 'https://assets.coingecko.com/coins/images/20764/standard/reth.png',
  cbETH: 'https://assets.coingecko.com/coins/images/27008/standard/cbeth.png',

  // DeFi & Popular tokens
  JUP: 'https://assets.coingecko.com/coins/images/34188/standard/jup.png',
  RAY: 'https://assets.coingecko.com/coins/images/13928/standard/PSigc4ie_400x400.jpg',
  BONK: 'https://assets.coingecko.com/coins/images/28600/standard/bonk.jpg',
  WIF: 'https://assets.coingecko.com/coins/images/33566/standard/dogwifhat.jpg',
  JTO: 'https://assets.coingecko.com/coins/images/33228/standard/jto.png',
  PYTH: 'https://assets.coingecko.com/coins/images/31924/standard/pyth.png',
  RNDR: 'https://assets.coingecko.com/coins/images/11636/standard/rndr.png',
  RENDER: 'https://assets.coingecko.com/coins/images/11636/standard/rndr.png',
  HNT: 'https://assets.coingecko.com/coins/images/4284/standard/Helium_HNT.png',
  INJ: 'https://assets.coingecko.com/coins/images/12882/standard/Secondary_Symbol.png',
  LINK: 'https://assets.coingecko.com/coins/images/877/standard/chainlink-new-logo.png',
  UNI: 'https://assets.coingecko.com/coins/images/12504/standard/uniswap-logo.png',
  AAVE: 'https://assets.coingecko.com/coins/images/12645/standard/aave-token-round.png',
  ARB: 'https://assets.coingecko.com/coins/images/16547/standard/arb.jpg',
  OP: 'https://assets.coingecko.com/coins/images/25244/standard/Optimism.png',
  MKR: 'https://assets.coingecko.com/coins/images/1364/standard/Mark_Maker.png',
  SNX: 'https://assets.coingecko.com/coins/images/3406/standard/SNX.png',
  CRV: 'https://assets.coingecko.com/coins/images/12124/standard/Curve.png',
  LDO: 'https://assets.coingecko.com/coins/images/13573/standard/Lido_DAO.png',
  APE: 'https://assets.coingecko.com/coins/images/24383/standard/apecoin.jpg',
  SAND: 'https://assets.coingecko.com/coins/images/12129/standard/sandbox_logo.jpg',
  MANA: 'https://assets.coingecko.com/coins/images/878/standard/decentraland-mana.png',
  GRT: 'https://assets.coingecko.com/coins/images/13397/standard/Graph_Token.png',
  FTM: 'https://assets.coingecko.com/coins/images/4001/standard/Fantom_round.png',
  COMP: 'https://assets.coingecko.com/coins/images/10775/standard/COMP.png',
  SUSHI: 'https://assets.coingecko.com/coins/images/12271/standard/512x512_Logo_no_chop.png',
  YFI: 'https://assets.coingecko.com/coins/images/11849/standard/yearn.jpg',
  '1INCH': 'https://assets.coingecko.com/coins/images/13469/standard/1inch-token.png',
  BAL: 'https://assets.coingecko.com/coins/images/11683/standard/Balancer.png',
  ENS: 'https://assets.coingecko.com/coins/images/19785/standard/acatxTm8_400x400.jpg',
  DYDX: 'https://assets.coingecko.com/coins/images/17500/standard/hjnIm9bV.jpg',
  GMX: 'https://assets.coingecko.com/coins/images/18323/standard/arbit.png',
  BLUR: 'https://assets.coingecko.com/coins/images/28453/standard/blur.png',
  STX: 'https://assets.coingecko.com/coins/images/2069/standard/Stacks_logo_full.png',
  IMX: 'https://assets.coingecko.com/coins/images/17233/standard/immutableX-symbol-BLK-RGB.png',
  MINA: 'https://assets.coingecko.com/coins/images/15628/standard/JM4_vQ34_400x400.png',
  FLOW: 'https://assets.coingecko.com/coins/images/13446/standard/5f6294c0c7a8cda55cb1c936_Flow_Wordmark.png',
  KAVA: 'https://assets.coingecko.com/coins/images/9761/standard/kava.png',
  CELO: 'https://assets.coingecko.com/coins/images/11090/standard/InjsYi4.png',
  ROSE: 'https://assets.coingecko.com/coins/images/13162/standard/rose.png',
  ONE: 'https://assets.coingecko.com/coins/images/4344/standard/Y88JAze.png',
  ZIL: 'https://assets.coingecko.com/coins/images/2687/standard/Zilliqa-logo.png',
  QTUM: 'https://assets.coingecko.com/coins/images/684/standard/Qtum_logo.png',
  ZEN: 'https://assets.coingecko.com/coins/images/691/standard/horizen.png',
  KSM: 'https://assets.coingecko.com/coins/images/9568/standard/m4zRhP5e_400x400.jpg',
  GLMR: 'https://assets.coingecko.com/coins/images/22459/standard/glmr.png',
  MOVR: 'https://assets.coingecko.com/coins/images/17984/standard/9285.png',
  ASTR: 'https://assets.coingecko.com/coins/images/22617/standard/astr.png',
  CFX: 'https://assets.coingecko.com/coins/images/13079/standard/3vuYMbjN.png',
  EGLD: 'https://assets.coingecko.com/coins/images/12335/standard/egld-token-logo.png',
  HBAR: 'https://assets.coingecko.com/coins/images/3688/standard/hbar.png',
  ICP: 'https://assets.coingecko.com/coins/images/14495/standard/Internet_Computer_logo.png',
  ALGO: 'https://assets.coingecko.com/coins/images/4380/standard/download.png',
  VET: 'https://assets.coingecko.com/coins/images/1167/standard/VET_Token_Icon.png',
  EOS: 'https://assets.coingecko.com/coins/images/738/standard/eos-eos-logo.png',
  XTZ: 'https://assets.coingecko.com/coins/images/976/standard/Tezos-logo.png',
  THETA: 'https://assets.coingecko.com/coins/images/2538/standard/theta-token-logo.png',
  NEO: 'https://assets.coingecko.com/coins/images/480/standard/NEO_512_512.png',
  IOTA: 'https://assets.coingecko.com/coins/images/692/standard/IOTA_Swirl.png',
  KCS: 'https://assets.coingecko.com/coins/images/1047/standard/sa9z79.png',
  LEO: 'https://assets.coingecko.com/coins/images/8418/standard/leo-token.png',
  OKB: 'https://assets.coingecko.com/coins/images/4463/standard/WeChat_Image_20220118095654.png',
  CRO: 'https://assets.coingecko.com/coins/images/7310/standard/cro_token_logo.png',
  FLR: 'https://assets.coingecko.com/coins/images/28624/standard/FLR-icon200x200.png',
  TWT: 'https://assets.coingecko.com/coins/images/11085/standard/Trust.png',
  GT: 'https://assets.coingecko.com/coins/images/8183/standard/gt.png',
  QNT: 'https://assets.coingecko.com/coins/images/3370/standard/5ZOu7brX_400x400.jpg',

  // Meme & trending tokens
  PEPE: 'https://assets.coingecko.com/coins/images/29850/standard/pepe-token.jpeg',
  SHIB: 'https://assets.coingecko.com/coins/images/11939/standard/shiba.png',
  FLOKI: 'https://assets.coingecko.com/coins/images/16746/standard/PNG_image.png',
  DEGEN: 'https://assets.coingecko.com/coins/images/34515/standard/android-chrome-512x512.png',
  BRETT: 'https://assets.coingecko.com/coins/images/35529/standard/1000050750.png',
  MOG: 'https://assets.coingecko.com/coins/images/31059/standard/MOG_LOGO_200x200.png',
  POPCAT: 'https://assets.coingecko.com/coins/images/33760/standard/popcat.png',
  MEW: 'https://assets.coingecko.com/coins/images/36440/standard/MEW.png',
  MYRO: 'https://assets.coingecko.com/coins/images/33093/standard/IMG_6397.jpeg',
  TOSHI: 'https://assets.coingecko.com/coins/images/31126/standard/toshi.png',
  TRUMP: 'https://assets.coingecko.com/coins/images/53746/standard/trump.jpg',
  MELANIA: 'https://assets.coingecko.com/coins/images/53893/standard/melania.png',
  FARTCOIN: 'https://assets.coingecko.com/coins/images/52401/standard/fartcoin.jpg',
  AI16Z: 'https://assets.coingecko.com/coins/images/52836/standard/ai16z.jpg',
  PENGU: 'https://assets.coingecko.com/coins/images/52327/standard/pudgy.jpg',
  VIRTUAL: 'https://assets.coingecko.com/coins/images/52304/standard/Virtuals.jpeg',
  SPX: 'https://assets.coingecko.com/coins/images/31401/standard/sticker_%281%29.jpg',
  GIGA: 'https://assets.coingecko.com/coins/images/37783/standard/GIGA.png',
  MOTHER: 'https://assets.coingecko.com/coins/images/37770/standard/mother_iggy.png',
  BOME: 'https://assets.coingecko.com/coins/images/36071/standard/bome.jpg',
  SLERF: 'https://assets.coingecko.com/coins/images/36236/standard/slerf.png',
  WEN: 'https://assets.coingecko.com/coins/images/34856/standard/wen.jpg',
  ONDO: 'https://assets.coingecko.com/coins/images/26580/standard/ONDO.png',
  W: 'https://assets.coingecko.com/coins/images/35087/standard/womrhole_logo_full_color_rgb_2000px_72ppi_fb766ac85a.png',
  ENA: 'https://assets.coingecko.com/coins/images/36530/standard/ethena.png',
  STRK: 'https://assets.coingecko.com/coins/images/26433/standard/starknet.png',
  EIGEN: 'https://assets.coingecko.com/coins/images/37458/standard/eigenlayer.jpeg',
  ZRO: 'https://assets.coingecko.com/coins/images/28206/standard/ftxG9_TJ_400x400.jpeg',
  ZK: 'https://assets.coingecko.com/coins/images/38043/standard/ZKTokenBlack.png',
  NOT: 'https://assets.coingecko.com/coins/images/35157/standard/not.jpeg',
  DOGS: 'https://assets.coingecko.com/coins/images/39585/standard/DOGS.jpg',
  HAMSTER: 'https://assets.coingecko.com/coins/images/39102/standard/hamster-removebg-preview.png',
  CATI: 'https://assets.coingecko.com/coins/images/39763/standard/CATILOGO200px.png',
  HMSTR: 'https://assets.coingecko.com/coins/images/39102/standard/hamster-removebg-preview.png',
  MOODENG: 'https://assets.coingecko.com/coins/images/40404/standard/moodeng.jpg',
  GOAT: 'https://assets.coingecko.com/coins/images/51407/standard/goat.jpg',
  PNUT: 'https://assets.coingecko.com/coins/images/51663/standard/peanut.jpg',
  ACT: 'https://assets.coingecko.com/coins/images/51719/standard/act.png',
  GRASS: 'https://assets.coingecko.com/coins/images/40431/standard/grass.jpg',
  CHILLGUY: 'https://assets.coingecko.com/coins/images/52036/standard/chillguy.jpg',
  ME: 'https://assets.coingecko.com/coins/images/52306/standard/ME.jpg',
};

/**
 * Get the icon URL for a token
 * @param symbol - Token symbol (e.g., "SOL", "USDC")
 * @param chain - Optional chain identifier (e.g., "eth", "sol")
 * @returns Icon URL or null if not found
 */
export function getTokenIcon(symbol: string, chain?: string): string | null {
  // Normalize symbol
  const upperSymbol = symbol.toUpperCase();

  // Check if we have a direct mapping
  if (TOKEN_ICONS[upperSymbol]) {
    return TOKEN_ICONS[upperSymbol];
  }

  // Check original case
  if (TOKEN_ICONS[symbol]) {
    return TOKEN_ICONS[symbol];
  }

  return null;
}

/**
 * Get token icon for an asset string (handles "SYMBOL" and "SYMBOL:CHAIN" formats)
 * @param asset - Asset string (e.g., "SOL", "ETH:eth", "USDC:base")
 * @returns Icon URL or null if not found
 */
export function getAssetIcon(asset: string): string | null {
  if (asset.includes(':')) {
    const [symbol, chain] = asset.split(':');
    return getTokenIcon(symbol ?? asset, chain);
  }
  return getTokenIcon(asset, 'sol');
}
