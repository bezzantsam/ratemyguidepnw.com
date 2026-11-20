/** Display-only overlay; source IDs, canonical names and relationships never change. */
export function preferredDisplayName(listed:string,preferred:string|null|undefined):string {
 const name=preferred?.trim();if(!name||name.toLocaleLowerCase()===listed.trim().toLocaleLowerCase())return listed;
 if(/\s/u.test(name))return name;
 const parts=listed.trim().match(/^(\S+)\s+(.+)$/u);
 return parts?`${parts[1]} “${name}” ${parts[2]}`:name;
}
