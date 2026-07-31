import * as XLSX from "xlsx";
import fs from "node:fs";
const out = "/tmp/imptest";
// merged-cell + repeated-header + section banner workbook
const aoa: any[][] = [
  ["JULY 2026 PRICE LIST","","","","",""],
  ["4K UHD SMART TV","4K UHD SMART TV","4K UHD SMART TV","4K UHD SMART TV","4K UHD SMART TV","4K UHD SMART TV"],
  ["Product Code","Description","Specifications","Availability","Dealer Price","Promotional Price"],
  ["55A6K","55\" UHD Smart TV","HDR10 | Dolby","In Stock","6000","5500"],
  ["55A6K","55\" UHD Smart TV duplicate","HDR10","In Stock","6000","5500"],
  ["65U7K","65\" ULED Smart TV","Mini LED","Low Stock","","abc"],
  ["70A7K","70\" UHD Smart TV","HDR","EOL","9000","8500"],
  ["","","","","",""],
  ["SOUND BAR","","","","",""],
  ["Product Code","Description","Specifications","Availability","Dealer Price","Promotional Price"],
  ["HS214","2.1ch Soundbar","214W","In Stock","1500","1350"],
  ["NEWSKU-001","Brand New Air Fryer 5L","Digital","New In Stock","900","850"],
  ["E&OE. Prices subject to change without notice. Terms and conditions apply.","","","","",""],
];
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(aoa);
ws["!merges"] = [{ s:{r:1,c:0}, e:{r:1,c:5} }, { s:{r:8,c:0}, e:{r:8,c:5} }];
XLSX.utils.book_append_sheet(wb, ws, "Price List");
XLSX.writeFile(wb, `${out}/edge-cases.xlsx`);
fs.writeFileSync(`${out}/catalogue.csv`,
`Product Code,Description,Availability,Dealer Price,Promotional Price
55A6K,55" UHD Smart TV,In Stock,6100,5600
CSV-NEW-1,Unknown Brand Toaster,In Stock,300,280
,Missing code row,In Stock,100,90
BAD-PRICE,Invalid price item,In Stock,-5,0
`);
console.log("generated");
