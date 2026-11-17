import {canonicalReviewRequestUrl} from './canonical-share';
import {qrcodegen} from './vendor/qrcodegen';

/** Local SVG output contains the QR modules only; no third-party service is contacted. */
export function reviewRequestQrSvg(profilePath:string):string {
  const url=canonicalReviewRequestUrl(profilePath);
  const qr=qrcodegen.QrCode.encodeText(url,qrcodegen.QrCode.Ecc.MEDIUM);
  const quiet=4, size=qr.size+quiet*2;
  const modules:string[]=[];
  for(let y=0;y<qr.size;y++) for(let x=0;x<qr.size;x++) {
    if(qr.getModule(x,y)) modules.push(`M${x+quiet},${y+quiet}h1v1h-1z`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size*8}" height="${size*8}" role="img" aria-label="Review request QR code"><rect width="${size}" height="${size}" fill="#fff"/><path d="${modules.join('')}" fill="#000"/></svg>`;
}
