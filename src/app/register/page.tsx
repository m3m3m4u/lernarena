"use client";
import { useState } from "react";

export default function RegisterPage() {
  const [form, setForm] = useState({ username: "", name: "", password: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Fehler bei der Registrierung.");
    } else {
      setSuccess("Registrierung erfolgreich! Du kannst dich jetzt einloggen.");
      setForm({ username: "", name: "", password: "" });
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded shadow">
      <h2 className="text-2xl font-bold mb-4">Registrieren</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          name="username"
          placeholder="Benutzername"
          value={form.username}
          onChange={handleChange}
          className="w-full p-2 border rounded"
          required
        />
        <input
          type="text"
          name="name"
          placeholder="Name"
          value={form.name}
          onChange={handleChange}
          className="w-full p-2 border rounded"
          required
        />
        <input
          type="password"
          name="password"
          placeholder="Passwort"
          value={form.password}
          onChange={handleChange}
          className="w-full p-2 border rounded"
          required
        />
        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded font-semibold">Registrieren</button>
      </form>
      {error && <p className="text-red-600 mt-4">{error}</p>}
      {success && (
        <div className="text-green-600 mt-4">
          {success}
          <br />
          <a href="/login" className="text-blue-600 underline">Jetzt einloggen</a>
        </div>
      )}
    </div>
  );
}
