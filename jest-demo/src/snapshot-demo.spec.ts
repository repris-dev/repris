describe('shapshot-demo', () => {
  test('foo', () => {
    const n = 'hello';
    expect(n).toMatchSnapshot();
  });
});
