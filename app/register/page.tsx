export default function Register() {
    return (
      <main className="min-h-screen bg-white px-6 py-16">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-semibold text-gray-900 mb-6">
            Register a patient
          </h1>
          <form className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
              <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of birth</label>
              <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
              <input type="tel" className="w-full border border-gray-300 rounded-lg px-3 py-2" />
            </div>
            <button type="submit" className="w-full bg-gray-900 text-white rounded-lg py-2 font-medium hover:bg-gray-800 transition">
              Register patient
            </button>
          </form>
        </div>
      </main>
    );
  }