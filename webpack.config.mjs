import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default function webpackConfig(_, argv = {}) {
  const mode = argv.mode || 'production';
  const isDev = mode === 'development';

  return {
    mode,
    target: 'web',
    experiments: {
      outputModule: true
    },
    entry: {
      app: path.resolve(rootDir, 'public/webpack-entry.mjs')
    },
    output: {
      path: path.resolve(rootDir, 'public/dist'),
      filename: '[name].bundle.mjs',
      module: true,
      publicPath: '/dist/',
      clean: true
    },
    devtool: isDev ? 'source-map' : false,
    resolve: {
      extensions: ['.mjs', '.js']
    },
    module: {
      rules: [
        {
          test: /\.css$/i,
          use: [
            MiniCssExtractPlugin.loader,
            {
              loader: 'css-loader',
              options: {
                sourceMap: isDev
              }
            }
          ]
        }
      ]
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: '[name].bundle.css'
      })
    ]
  };
}
