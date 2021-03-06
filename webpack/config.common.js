const path = require('path');

module.exports = {
  output: {
    path: path.join(__dirname, '..', 'app/dist'),
    libraryTarget: 'commonjs2',
  },
  module: {
    rules: [
      { test: /.js$/, loader: 'babel-loader', exclude: /node_modules/ },
      {
        test: /.png$/,
        loader: 'file-loader',
        options: { name: '[name].[ext]' },
      },
    ],
  },
  externals: /electron|(fix-path|execa|tree-kill|menubar$)/,
  node: {
    __dirname: false,
    __filename: false,
  },
  performance: {
    hints: false,
  },
};
