export function createSessionWorkingDirectory(initialDirectory) {
  let currentDirectory = initialDirectory;
  return {
    get: () => currentDirectory,
    set: (directory) => {
      currentDirectory = directory;
    },
  };
}
