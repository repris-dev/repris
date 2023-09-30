import { array } from "@sampleci/base";
import { useState } from "react";

function App(): JSX.Element {
  const arr = [5, 4, 2, 8, 9];
  const median = array.quickselect(arr, 2);
  const [foo] = useState(median);

  return <h1>{JSON.stringify(foo)}</h1>;
}

export default App;
