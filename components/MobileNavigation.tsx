'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Bookmark, House, MessagesSquare, Search} from 'lucide-react';

const tabs=[
 {href:'/',label:'Home',Icon:House},
 {href:'/guides',label:'Guides',Icon:Search},
 {href:'/reviews',label:'Dock Talk',Icon:MessagesSquare},
 {href:'/saved',label:'Saved',Icon:Bookmark},
] as const;

export default function MobileNavigation(){
 const pathname=usePathname();
 return <nav className="mobile-navigation" aria-label="Mobile primary navigation">
  {tabs.map(({href,label,Icon})=>{
   const active=href==='/'?pathname==='/':
     pathname===href||(href==='/guides'&&pathname.startsWith('/guides/')&&pathname!=='/guides/verification');
   return <Link key={href} href={href} aria-current={active?'page':undefined}
     className={active?'mobile-navigation-link active':'mobile-navigation-link'}>
      <Icon size={21} aria-hidden="true" strokeWidth={active?2.5:2}/>
      <span>{label}</span>
   </Link>;
  })}
 </nav>;
}
