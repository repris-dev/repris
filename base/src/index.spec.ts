import * as x from './index.js';

test('hello', () => {
  expect(x.hello()).toMatchSnapshot();
});
