import { hello } from "@sampleci/base";
import { useState } from "react";

function App(): JSX.Element {
  const [foo] = useState(hello());

  return <h1>{JSON.stringify(foo)}</h1>;
}

export default App;
