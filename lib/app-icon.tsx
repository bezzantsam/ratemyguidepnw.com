import { ImageResponse } from 'next/og';

/** Original app branding rendered at build-time, no remote fonts or images. */
export function renderAppIcon(size: number): ImageResponse {
  const panel = Math.round(size * 0.66);
  return new ImageResponse(
    <div style={{
      width: '100%', height: '100%', background: '#0b2427',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: panel, height: panel, border: Math.max(3, Math.round(size * 0.014)) + 'px solid #d8b26b',
        borderRadius: Math.round(size * 0.12), background: '#123a3b',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{color: '#fff8e7',fontSize: Math.round(size * 0.215),fontWeight: 900,letterSpacing: -2,display:'flex'}}>
          RMG
        </div>
        <div style={{color: '#d8b26b',fontSize: Math.round(size * 0.11),fontWeight: 800,letterSpacing: Math.max(1, Math.round(size*0.013)),display:'flex'}}>
          PNW
        </div>
      </div>
    </div>,
    {width:size,height:size}
  );
}
