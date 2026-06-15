import type { StudentRow } from "./types";

const schools = ["Hopkins School", "King School", "St. Luke's School", "Foote School"];
const grades = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const ctTowns = [
  ["12 Maple Ave", "New Haven, CT 06511"],
  ["44 Elm Street", "Hamden, CT 06517"],
  ["78 Whitney Ave", "New Haven, CT 06510"],
  ["301 Forest Rd", "Stamford, CT 06903"],
  ["119 Long Ridge Rd", "Stamford, CT 06905"],
  ["8 Beach Drive", "Old Saybrook, CT 06475"],
  ["55 Riverside Ave", "Westport, CT 06880"],
  ["27 Sound View Dr", "Greenwich, CT 06830"],
  ["91 Orange St", "New Haven, CT 06511"],
  ["210 Bedford St", "Stamford, CT 06901"],
  ["35 Round Hill Rd", "Greenwich, CT 06831"],
  ["67 Pine Hill Rd", "Hamden, CT 06518"],
];

const firstNames = ["Liam","Olivia","Noah","Emma","Aiden","Ava","Lucas","Mia","Ethan","Sophia","Mason","Isabella","Logan","Charlotte","James","Amelia","Benjamin","Harper","Henry","Evelyn","Jack","Zoe","Daniel","Lily","Owen","Grace"];
const lastNames = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez","Hernandez","Lopez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin","Lee","Perez","Thompson","White","Harris","Sanchez","Clark"];

function pick<T>(a: T[], i: number) { return a[i % a.length]; }

export function buildDemoStudents(): StudentRow[] {
  const rows: StudentRow[] = [];
  let n = 0;
  for (let f = 0; f < 28; f++) {
    const school = pick(schools, f);
    const family = pick(lastNames, f * 3 + 1);
    const [a1, a2] = pick(ctTowns, f);
    const parentName = `${pick(firstNames, f + 7)} ${family}`;
    const parentEmail = `${family.toLowerCase()}.${pick(firstNames, f + 7).toLowerCase()}@example.com`;
    const phone = `(203) 555-0${(100 + f).toString().slice(-3)}`;
    const stopPairs = pick(ctTowns, f + 4);
    const stop = `${stopPairs[0]}, ${stopPairs[1]}`;
    const kidCount = (f % 3) + 1;
    for (let s = 0; s < kidCount; s++) {
      const studentFirst = pick(firstNames, n + s * 5);
      const alert = n % 9 === 0;
      rows.push({
        id: `demo-${n}`,
        submissionId: `demo-sub-${f}`,
        formId: "demo",
        schoolName: school,
        studentName: `${studentFirst} ${family}`,
        grade: pick(grades, n + s),
        stopAddress: stop,
        parentName,
        parentPhone: phone,
        parentEmail,
        parentAddress: `${a1}, ${a2}`,
        notes: alert ? "Allergy: peanuts. EpiPen required." : "",
        alertFlag: alert,
        duplicateFlag: false,
        status: (["New", "Reviewed", "Confirmed", "Exported"] as const)[n % 4],
        submissionDate: new Date(Date.now() - n * 86400000 * 0.4).toISOString(),
      });
      n++;
    }
  }
  // Inject a duplicate (same student name + address)
  if (rows.length) {
    const d = rows[2];
    rows.push({
      ...d,
      id: `demo-dup-${d.id}`,
      submissionId: `demo-sub-dup`,
      submissionDate: new Date().toISOString(),
      status: "New",
    });
  }
  return rows;
}
