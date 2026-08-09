// Keep terminal-oriented production writes out of Jest output. Tests that
// verify terminal output replace process.stdout.write locally.
process.stdout.write = () => true;
