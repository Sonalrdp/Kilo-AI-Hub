async function test() {
  try {
    const res = await fetch('https://god-maog.onrender.com/openai/v1/models');
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Data:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error:', e);
  }
}
test();
