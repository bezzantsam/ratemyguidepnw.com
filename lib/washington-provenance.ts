/**
 * Washington imports are third-party directories/association lists, NOT
 * official WDFW records. No imported source alone establishes current licensing.
 */
export type WashingtonSourceType='association_directory'|'charter_directory'|'other_directory'|'web_listing';
export type WashingtonProvenance={
  label:string;
  type:WashingtonSourceType;
  officialLicenseRecord:false;
};

const SOURCE_TYPES:Record<string,WashingtonProvenance>={
  WSGA:{label:'Washington guide association directory',type:'association_directory',officialLicenseRecord:false},
  'WSGA/CAPS':{label:'Guide association and charter directory listings',type:'association_directory',officialLicenseRecord:false},
  'WSGA/local':{label:'Guide association and public directory listings',type:'association_directory',officialLicenseRecord:false},
  CAPS:{label:'Public charter directory listing',type:'charter_directory',officialLicenseRecord:false},
  NACO:{label:'Public charter directory listing',type:'charter_directory',officialLicenseRecord:false},
  'NW Fishing':{label:'Public fishing directory listing',type:'other_directory',officialLicenseRecord:false},
  'Fishin Magician':{label:'Public fishing directory listing',type:'other_directory',officialLicenseRecord:false},
  localfishingguides:{label:'Public fishing-guide directory listing',type:'other_directory',officialLicenseRecord:false},
  Web:{label:'Imported public website listing',type:'web_listing',officialLicenseRecord:false},
};

const UNKNOWN_SOURCE:WashingtonProvenance={
  label:'Imported third-party directory (source not classified)',
  type:'other_directory',
  officialLicenseRecord:false,
};

export function classifyWashingtonSource(source:string):WashingtonProvenance {
  return Object.prototype.hasOwnProperty.call(SOURCE_TYPES,source)
    ? SOURCE_TYPES[source]
    : UNKNOWN_SOURCE;
}
