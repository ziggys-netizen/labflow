"use client";

import { useState } from "react";
import { db } from "../lib/firebase";
import { collection, addDoc } from "firebase/firestore";

function generateLabId() {
  const today = new Date();
  const datePart = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `LF-${datePart}-${randomPart}`;
}

export default function Register() {
  const [name, setName] = useState("");
  const [sex, setSex] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [nextOfKin, setNextOfKin] = useState("");
  const [status, setStatus] = useState("");
  const [lastLabId, setLastLabId] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("Saving...");
    const labId = generateLabId();
    try {
      await addDoc(collection(db, "patients"), {
        labId,
        name,
        sex,
        dob,
        phone,
        address,
        nationalId: nationalId || null,
        nextOfKin: nextOfKin || null,
        createdAt: new Date().toISOString(),
      });
      setStatus("Patient registered successfully.");
      setLastLabId(labId);
      setName("");
      setSex("");
      setDob("");
      setPhone("");
      setAddress("");
      setNationalId("");
      setNextOfKin("");
    } catch (error) {
      console.error(error);
      setStatus("Something went wrong. Please try again.");
    }
  };

  return (
    <main className="min-h-screen bg-white px-6 py-16">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Register a patient</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sex</label>
            <select value={sex} onChange={(e) => setSex(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2">
              <option value="">Select...</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date of birth</label>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address / Locality</label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="e.g. Brikama, Western Region" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">National ID number <span className="text-gray-400 font-normal">(optional)</span></label>
            <input type="text" value={nationalId} onChange={(e) => setNationalId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Next of kin <span className="text-gray-400 font-normal">(name and phone, optional)</span></label>
            <input type="text" value={nextOfKin} onChange={(e) => setNextOfKin(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="e.g. Awa Jallow, 220 XXX XXXX" />
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