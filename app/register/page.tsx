"use client";

import { useState } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc, query, where, getDocs } from "firebase/firestore";

const COUNTRY_CODES = [
  { code: "+93", label: "🇦🇫 Afghanistan (+93)" },
  { code: "+355", label: "🇦🇱 Albania (+355)" },
  { code: "+213", label: "🇩🇿 Algeria (+213)" },
  { code: "+244", label: "🇦🇴 Angola (+244)" },
  { code: "+54", label: "🇦🇷 Argentina (+54)" },
  { code: "+374", label: "🇦🇲 Armenia (+374)" },
  { code: "+61", label: "🇦🇺 Australia (+61)" },
  { code: "+43", label: "🇦🇹 Austria (+43)" },
  { code: "+994", label: "🇦🇿 Azerbaijan (+994)" },
  { code: "+973", label: "🇧🇭 Bahrain (+973)" },
  { code: "+880", label: "🇧🇩 Bangladesh (+880)" },
  { code: "+375", label: "🇧🇾 Belarus (+375)" },
  { code: "+32", label: "🇧🇪 Belgium (+32)" },
  { code: "+229", label: "🇧🇯 Benin (+229)" },
  { code: "+975", label: "🇧🇹 Bhutan (+975)" },
  { code: "+591", label: "🇧🇴 Bolivia (+591)" },
  { code: "+267", label: "🇧🇼 Botswana (+267)" },
  { code: "+55", label: "🇧🇷 Brazil (+55)" },
  { code: "+673", label: "🇧🇳 Brunei (+673)" },
  { code: "+359", label: "🇧🇬 Bulgaria (+359)" },
  { code: "+226", label: "🇧🇫 Burkina Faso (+226)" },
  { code: "+257", label: "🇧🇮 Burundi (+257)" },
  { code: "+855", label: "🇰🇭 Cambodia (+855)" },
  { code: "+237", label: "🇨🇲 Cameroon (+237)" },
  { code: "+1", label: "🇨🇦 Canada (+1)" },
  { code: "+238", label: "🇨🇻 Cape Verde (+238)" },
  { code: "+236", label: "🇨🇫 Central African Republic (+236)" },
  { code: "+235", label: "🇹🇩 Chad (+235)" },
  { code: "+56", label: "🇨🇱 Chile (+56)" },
  { code: "+86", label: "🇨🇳 China (+86)" },
  { code: "+57", label: "🇨🇴 Colombia (+57)" },
  { code: "+269", label: "🇰🇲 Comoros (+269)" },
  { code: "+242", label: "🇨🇬 Congo-Brazzaville (+242)" },
  { code: "+243", label: "🇨🇩 Congo-Kinshasa (DRC) (+243)" },
  { code: "+506", label: "🇨🇷 Costa Rica (+506)" },
  { code: "+225", label: "🇨🇮 Côte d'Ivoire (+225)" },
  { code: "+385", label: "🇭🇷 Croatia (+385)" },
  { code: "+53", label: "🇨🇺 Cuba (+53)" },
  { code: "+357", label: "🇨🇾 Cyprus (+357)" },
  { code: "+420", label: "🇨🇿 Czechia (+420)" },
  { code: "+45", label: "🇩🇰 Denmark (+45)" },
  { code: "+253", label: "🇩🇯 Djibouti (+253)" },
  { code: "+20", label: "🇪🇬 Egypt (+20)" },
  { code: "+503", label: "🇸🇻 El Salvador (+503)" },
  { code: "+240", label: "🇬🇶 Equatorial Guinea (+240)" },
  { code: "+291", label: "🇪🇷 Eritrea (+291)" },
  { code: "+372", label: "🇪🇪 Estonia (+372)" },
  { code: "+268", label: "🇸🇿 Eswatini (+268)" },
  { code: "+251", label: "🇪🇹 Ethiopia (+251)" },
  { code: "+679", label: "🇫🇯 Fiji (+679)" },
  { code: "+358", label: "🇫🇮 Finland (+358)" },
  { code: "+33", label: "🇫🇷 France (+33)" },
  { code: "+241", label: "🇬🇦 Gabon (+241)" },
  { code: "+220", label: "🇬🇲 Gambia (+220)" },
  { code: "+995", label: "🇬🇪 Georgia (+995)" },
  { code: "+49", label: "🇩🇪 Germany (+49)" },
  { code: "+233", label: "🇬🇭 Ghana (+233)" },
  { code: "+30", label: "🇬🇷 Greece (+30)" },
  { code: "+502", label: "🇬🇹 Guatemala (+502)" },
  { code: "+224", label: "🇬🇳 Guinea (+224)" },
  { code: "+245", label: "🇬🇼 Guinea-Bissau (+245)" },
  { code: "+592", label: "🇬🇾 Guyana (+592)" },
  { code: "+509", label: "🇭🇹 Haiti (+509)" },
  { code: "+504", label: "🇭🇳 Honduras (+504)" },
  { code: "+852", label: "🇭🇰 Hong Kong (+852)" },
  { code: "+36", label: "🇭🇺 Hungary (+36)" },
  { code: "+354", label: "🇮🇸 Iceland (+354)" },
  { code: "+91", label: "🇮🇳 India (+91)" },
  { code: "+62", label: "🇮🇩 Indonesia (+62)" },
  { code: "+98", label: "🇮🇷 Iran (+98)" },
  { code: "+964", label: "🇮🇶 Iraq (+964)" },
  { code: "+353", label: "🇮🇪 Ireland (+353)" },
  { code: "+972", label: "🇮🇱 Israel (+972)" },
  { code: "+39", label: "🇮🇹 Italy (+39)" },
  { code: "+81", label: "🇯🇵 Japan (+81)" },
  { code: "+962", label: "🇯🇴 Jordan (+962)" },
  { code: "+7", label: "🇰🇿 Kazakhstan (+7)" },
  { code: "+254", label: "🇰🇪 Kenya (+254)" },
  { code: "+82", label: "🇰🇷 Korea, South (+82)" },
  { code: "+965", label: "🇰🇼 Kuwait (+965)" },
  { code: "+856", label: "🇱🇦 Laos (+856)" },
  { code: "+371", label: "🇱🇻 Latvia (+371)" },
  { code: "+961", label: "🇱🇧 Lebanon (+961)" },
  { code: "+266", label: "🇱🇸 Lesotho (+266)" },
  { code: "+231", label: "🇱🇷 Liberia (+231)" },
  { code: "+218", label: "🇱🇾 Libya (+218)" },
  { code: "+370", label: "🇱🇹 Lithuania (+370)" },
  { code: "+352", label: "🇱🇺 Luxembourg (+352)" },
  { code: "+261", label: "🇲🇬 Madagascar (+261)" },
  { code: "+265", label: "🇲🇼 Malawi (+265)" },
  { code: "+60", label: "🇲🇾 Malaysia (+60)" },
  { code: "+960", label: "🇲🇻 Maldives (+960)" },
  { code: "+223", label: "🇲🇱 Mali (+223)" },
  { code: "+356", label: "🇲🇹 Malta (+356)" },
  { code: "+222", label: "🇲🇷 Mauritania (+222)" },
  { code: "+230", label: "🇲🇺 Mauritius (+230)" },
  { code: "+52", label: "🇲🇽 Mexico (+52)" },
  { code: "+373", label: "🇲🇩 Moldova (+373)" },
  { code: "+976", label: "🇲🇳 Mongolia (+976)" },
  { code: "+382", label: "🇲🇪 Montenegro (+382)" },
  { code: "+212", label: "🇲🇦 Morocco (+212)" },
  { code: "+258", label: "🇲🇿 Mozambique (+258)" },
  { code: "+95", label: "🇲🇲 Myanmar (+95)" },
  { code: "+264", label: "🇳🇦 Namibia (+264)" },
  { code: "+977", label: "🇳🇵 Nepal (+977)" },
  { code: "+31", label: "🇳🇱 Netherlands (+31)" },
  { code: "+64", label: "🇳🇿 New Zealand (+64)" },
  { code: "+505", label: "🇳🇮 Nicaragua (+505)" },
  { code: "+227", label: "🇳🇪 Niger (+227)" },
  { code: "+234", label: "🇳🇬 Nigeria (+234)" },
  { code: "+47", label: "🇳🇴 Norway (+47)" },
  { code: "+968", label: "🇴🇲 Oman (+968)" },
  { code: "+92", label: "🇵🇰 Pakistan (+92)" },
  { code: "+507", label: "🇵🇦 Panama (+507)" },
  { code: "+595", label: "🇵🇾 Paraguay (+595)" },
  { code: "+51", label: "🇵🇪 Peru (+51)" },
  { code: "+63", label: "🇵🇭 Philippines (+63)" },
  { code: "+48", label: "🇵🇱 Poland (+48)" },
  { code: "+351", label: "🇵🇹 Portugal (+351)" },
  { code: "+974", label: "🇶🇦 Qatar (+974)" },
  { code: "+40", label: "🇷🇴 Romania (+40)" },
  { code: "+7", label: "🇷🇺 Russia (+7)" },
  { code: "+250", label: "🇷🇼 Rwanda (+250)" },
  { code: "+966", label: "🇸🇦 Saudi Arabia (+966)" },
  { code: "+221", label: "🇸🇳 Senegal (+221)" },
  { code: "+381", label: "🇷🇸 Serbia (+381)" },
  { code: "+248", label: "🇸🇨 Seychelles (+248)" },
  { code: "+232", label: "🇸🇱 Sierra Leone (+232)" },
  { code: "+65", label: "🇸🇬 Singapore (+65)" },
  { code: "+421", label: "🇸🇰 Slovakia (+421)" },
  { code: "+386", label: "🇸🇮 Slovenia (+386)" },
  { code: "+252", label: "🇸🇴 Somalia (+252)" },
  { code: "+27", label: "🇿🇦 South Africa (+27)" },
  { code: "+211", label: "🇸🇸 South Sudan (+211)" },
  { code: "+34", label: "🇪🇸 Spain (+34)" },
  { code: "+94", label: "🇱🇰 Sri Lanka (+94)" },
  { code: "+249", label: "🇸🇩 Sudan (+249)" },
  { code: "+597", label: "🇸🇷 Suriname (+597)" },
  { code: "+46", label: "🇸🇪 Sweden (+46)" },
  { code: "+41", label: "🇨🇭 Switzerland (+41)" },
  { code: "+963", label: "🇸🇾 Syria (+963)" },
  { code: "+886", label: "🇹🇼 Taiwan (+886)" },
  { code: "+255", label: "🇹🇿 Tanzania (+255)" },
  { code: "+66", label: "🇹🇭 Thailand (+66)" },
  { code: "+228", label: "🇹🇬 Togo (+228)" },
  { code: "+216", label: "🇹🇳 Tunisia (+216)" },
  { code: "+90", label: "🇹🇷 Turkey (+90)" },
  { code: "+256", label: "🇺🇬 Uganda (+256)" },
  { code: "+380", label: "🇺🇦 Ukraine (+380)" },
  { code: "+971", label: "🇦🇪 United Arab Emirates (+971)" },
  { code: "+44", label: "🇬🇧 United Kingdom (+44)" },
  { code: "+1", label: "🇺🇸 United States (+1)" },
  { code: "+598", label: "🇺🇾 Uruguay (+598)" },
  { code: "+998", label: "🇺🇿 Uzbekistan (+998)" },
  { code: "+58", label: "🇻🇪 Venezuela (+58)" },
  { code: "+84", label: "🇻🇳 Vietnam (+84)" },
  { code: "+967", label: "🇾🇪 Yemen (+967)" },
  { code: "+260", label: "🇿🇲 Zambia (+260)" },
  { code: "+263", label: "🇿🇼 Zimbabwe (+263)" },
];

function generateLabId() {
  const today = new Date();
  const datePart = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `LF-${datePart}-${randomPart}`;
}

// Normalizes a name: trims extra whitespace, converts to consistent Title Case
function normalizeName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) =>
      word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word
    )
    .join(" ");
}

const NAME_REGEX = /^[a-zA-Z\s\-'.]{2,100}$/;
const PHONE_DIGITS_REGEX = /^[0-9]{6,10}$/;
const NATIONAL_ID_REGEX = /^[a-zA-Z0-9\-]{4,30}$/;

export default function Register() {
  const [name, setName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [sex, setSex] = useState("");
  const [dob, setDob] = useState("");
  const [countryCode, setCountryCode] = useState("+220");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [address, setAddress] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [nextOfKin, setNextOfKin] = useState("");
  const [referringClinician, setReferringClinician] = useState("");
  const [reasonForVisit, setReasonForVisit] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [lastLabId, setLastLabId] = useState("");

  function validate() {
    const newErrors: Record<string, string> = {};

    if (!NAME_REGEX.test(name.trim())) {
      newErrors.name = "Enter a valid name (letters only, at least 2 characters).";
    }
    if (preferredName.trim() && !NAME_REGEX.test(preferredName.trim())) {
      newErrors.preferredName = "Enter a valid name (letters only).";
    }
    if (!sex) {
      newErrors.sex = "Please select a sex.";
    }
    if (!dob) {
      newErrors.dob = "Date of birth is required.";
    } else if (new Date(dob) > new Date()) {
      newErrors.dob = "Date of birth cannot be in the future.";
    }
    if (!PHONE_DIGITS_REGEX.test(phoneLocal.trim())) {
      newErrors.phone = "Enter a valid phone number (digits only, 6-10 digits, no country code).";
    }
    if (address.trim().length < 2) {
      newErrors.address = "Address is required.";
    }
    if (nationalId.trim() && !NATIONAL_ID_REGEX.test(nationalId.trim())) {
      newErrors.nationalId = "National ID should be letters/numbers only, 4-30 characters.";
    }
    if (!NAME_REGEX.test(referringClinician.trim())) {
      newErrors.referringClinician = "Enter the referring clinician's name (letters only).";
    }
    if (!consentGiven) {
      newErrors.consent = "Patient consent is required before registration.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function findDuplicates(): Promise<{ found: boolean; matches: string[] }> {
    const normalizedName = normalizeName(name).toLowerCase();
    const fullPhone = `${countryCode}${phoneLocal.trim()}`;
    const matches: string[] = [];

    // Check 1: same name + same date of birth
    const dobQuery = query(collection(db, "patients"), where("dob", "==", dob));
    const dobSnapshot = await getDocs(dobQuery);
    dobSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if ((data.name || "").trim().toLowerCase() === normalizedName) {
        matches.push(`Name + DOB match — Lab ID: ${data.labId}`);
      }
    });

    // Check 2: same phone number
    const phoneQuery = query(collection(db, "patients"), where("phone", "==", fullPhone));
    const phoneSnapshot = await getDocs(phoneQuery);
    phoneSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const alreadyListed = matches.some((m) => m.includes(data.labId));
      if (!alreadyListed) {
        matches.push(`Same phone number — Lab ID: ${data.labId} (${data.name})`);
      }
    });

    return { found: matches.length > 0, matches };
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("");
    if (!validate()) return;

    setStatus("Checking for existing records...");
    const duplicateCheck = await findDuplicates();

    if (duplicateCheck.found) {
      const proceed = window.confirm(
        `Possible existing record(s) found:\n\n${duplicateCheck.matches.join("\n")}\n\nRegister anyway as a new record?`
      );
      if (!proceed) {
        setStatus("Registration cancelled — existing record kept.");
        return;
      }
    }

    setStatus("Saving...");
    const labId = generateLabId();
    const fullPhone = `${countryCode}${phoneLocal.trim()}`;
    const cleanName = normalizeName(name);
    const cleanPreferredName = preferredName.trim() ? normalizeName(preferredName) : null;
    const cleanClinician = normalizeName(referringClinician);

    try {
      await addDoc(collection(db, "patients"), {
        labId,
        name: cleanName,
        preferredName: cleanPreferredName,
        sex,
        dob,
        phone: fullPhone,
        address: address.trim(),
        nationalId: nationalId.trim() || null,
        nextOfKin: nextOfKin.trim() || null,
        referringClinician: cleanClinician,
        reasonForVisit: reasonForVisit.trim() || null,
        consentGiven: true,
        createdAt: new Date().toISOString(),
      });
      setStatus("Patient registered successfully.");
      setLastLabId(labId);
      setName("");
      setPreferredName("");
      setSex("");
      setDob("");
      setPhoneLocal("");
      setAddress("");
      setNationalId("");
      setNextOfKin("");
      setReferringClinician("");
      setReasonForVisit("");
      setConsentGiven(false);
      setErrors({});
    } catch (error) {
      console.error(error);
      setStatus("Something went wrong. Please try again.");
    }
  };

  return (
    <main className="min-h-screen bg-white px-6 py-16">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Register a patient</h1>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 ${errors.name ? "border-red-500" : "border-gray-300"}`}
            />
            {errors.name && <p className="text-sm text-red-600 mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Preferred / alternate name <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 ${errors.preferredName ? "border-red-500" : "border-gray-300"}`}
            />
            {errors.preferredName && <p className="text-sm text-red-600 mt-1">{errors.preferredName}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sex</label>
            <select
              value={sex}
              onChange={(e) => setSex(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 ${errors.sex ? "border-red-500" : "border-gray-300"}`}
            >
              <option value="">Select...</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Other">Other</option>
            </select>
            {errors.sex && <p className="text-sm text-red-600 mt-1">{errors.sex}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date of birth</label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 ${errors.dob ? "border-red-500" : "border-gray-300"}`}
            />
            {errors.dob && <p className="text-sm text-red-600 mt-1">{errors.dob}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
            <div className="flex gap-2">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-2 w-48"
              >
                {COUNTRY_CODES.map((c) => (
                  <option key={c.label} value={c.code}>{c.label}</option>
                ))}
              </select>
              <input
                type="tel"
                value={phoneLocal}
                onChange={(e) => setPhoneLocal(e.target.value)}
                placeholder="7267765"
                className={`flex-1 border rounded-lg px-3 py-2 ${errors.phone ? "border-red-500" : "border-gray-300"}`}
              />
            </div>
            {errors.phone && <p className="text-sm text-red-600 mt-1">{errors.phone}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address / Locality</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Brikama, Western Region"
              className={`w-full border rounded-lg px-3 py-2 ${errors.address ? "border-red-500" : "border-gray-300"}`}
            />
            {errors.address && <p className="text-sm text-red-600 mt-1">{errors.address}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              National ID number <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 ${errors.nationalId ? "border-red-500" : "border-gray-300"}`}
            />
            {errors.nationalId && <p className="text-sm text-red-600 mt-1">{errors.nationalId}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Next of kin <span className="text-gray-400 font-normal">(name and phone, optional)</span>
            </label>
            <input
              type="text"
              value={nextOfKin}
              onChange={(e) => setNextOfKin(e.target.value)}
              placeholder="e.g. Awa Jallow, 220 XXX XXXX"
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Referring clinician</label>
            <input
              type="text"
              value={referringClinician}
              onChange={(e) => setReferringClinician(e.target.value)}
              placeholder="Name of requesting doctor/nurse"
              className={`w-full border rounded-lg px-3 py-2 ${errors.referringClinician ? "border-red-500" : "border-gray-300"}`}
            />
            {errors.referringClinician && <p className="text-sm text-red-600 mt-1">{errors.referringClinician}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for visit / clinical notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={reasonForVisit}
              onChange={(e) => setReasonForVisit(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>

          <div className="border-t border-gray-200 pt-4">
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                className="mt-1"
              />
              <span>
                The patient (or their guardian) has been informed about this laboratory testing and consents to registration and sample collection.
              </span>
            </label>
            {errors.consent && <p className="text-sm text-red-600 mt-1">{errors.consent}</p>}
          </div>

          <button type="submit" className="w-full bg-gray-900 text-white rounded-lg py-2 font-medium hover:bg-gray-800 transition">
            Register patient
          </button>

          {status && <p className="text-sm text-gray-600 mt-2">{status}</p>}
          {lastLabId && (
            <p className="text-sm text-gray-900 font-medium mt-1">
              Lab ID assigned: {lastLabId}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
