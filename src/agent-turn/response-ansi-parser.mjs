export function createResponseAnsiParser() {
  let pending = "";
  return {
    parse(text) {
      const input = `${pending}${text}`;
      pending = "";
      let output = "";
      let index = 0;
      while (index < input.length) {
        if (input[index] !== "\u001b") {
          output += input[index++];
          continue;
        }
        if (index + 1 >= input.length) {
          pending = input.slice(index);
          break;
        }
        if (input[index + 1] !== "[") {
          output += input[index++];
          continue;
        }
        let end = index + 2;
        while (
          end < input.length &&
          !(input.charCodeAt(end) >= 0x40 && input.charCodeAt(end) <= 0x7e)
        )
          end += 1;
        if (end >= input.length) {
          pending = input.slice(index);
          break;
        }
        output += input.slice(index, end + 1);
        index = end + 1;
      }
      return output;
    },
    flush() {
      const output = pending;
      pending = "";
      return output;
    },
  };
}
