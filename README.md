# 🛠️ SchemaGenius - Database Schema Generation

**Extension Name:** SchemaGenius

## 📚 Overview

SchemaGenius is a Visual Studio Code extension that facilitates the rapid generation of complete database schema code by providing a Database Markup Language (DBML) file.

## Playground

1. **Initialize a new project:**
```sh
yarn init -y
mkdir src
mkdir src/database
```

2. **Follow [usage](#-usage):**
3. **Update relationship name (more information at [notes](#-notes))**:
- `/src/database/entities/Movie.ts`

|Generated Code|Your desired code|
|-|-|

<table>
<tr>
<td> Generated code </td> <td> Your desired code </td>
</tr>
<tr>
<td>

```typescript
@Entity({ name: 'movies' })
class Movie extends CoreMovie {
  @ManyToOne('Author', 'moviesAuthorId')
  @JoinColumn( /* options */ )
  authorAuthorId: Relation<Author>
}
```

</td>

<td>

```typescript
@Entity({ name: 'movies' })
class Movie extends CoreMovie {
  @ManyToOne('Author', 'movies')
  @JoinColumn( /* options */ )
  author: Relation<Author>  // edit here
}
```

</td>
</tr>
</table>

- `/src/database/entities/Author.ts`
<table>
<tr>
<td> Generated code </td> <td> Your desired code </td>
</tr>
<tr>
<td>

```typescript
@Entity({ name: 'authors' })
class Author extends CoreAuthor {
  @OneToMany('Movie', 'authorAuthorId')
  moviesAuthorId: Relation<Movie>
}
```

</td>

<td>

```typescript
@Entity({ name: 'authors' })
class Author extends CoreAuthor {
  @OneToMany('Movie', 'author')
  movies: Relation<Movie>   // edit here
}
```

</td>
</tr>
</table>


4. **Playground with this code:**
```typescript
// playground.ts
import { AppDataSource } from "./src/database";
import "reflect-metadata";
import Author from "./src/database/entities/Author";
import Movie from "./src/database/entities/Movie";


async function main(): Promise<void> {
  await AppDataSource.initialize();

  const authors = AppDataSource.getRepository(Author);
  const author = authors.create({ name: "loc" });

  const movies = AppDataSource.getRepository(Movie)
    const movie = movies.create({
      name: 'loc',
      releaseYear: 2032,
    });

  movie.author = author

  await authors.save(author);
  await movies.save(movie);

  const movielist = await movies.find({
    relations: {
      author: true,
    },
  });
  console.log(movielist);
}

main().then(() => {});
```

5. **Create `.env` file (if needed) and add the folloing contents:**
```.env
DB_HOST=
DB_PORT=
DB_NAME=
DB_USER=
DB_PASS=
```

6. **Migration:** (read more at [typeorm.io](https://typeorm.io/))

- Generate migration file:
```sh
yarn typeorm-ts-node-commonjs migration:generate -d ./src/database -p ./src/database/migrations/first-migration
```
- Migrate up:

```sh
yarn typeorm-ts-node-commonjs migration:run -d ./src/database
```

7. **Run `playground.ts`:**
```sh
yarn ts-node playground.ts
```

## 🚀 Usage

1. **Accessing the Command:** Open Visual Studio Code and press `Ctrl+Shift+P`.
2. **Select Command:** Run the command "Generate Schema".
3. **Choose ORM Library:** Pick the your desired ORM Library (e.g. TypeORM). (Up to now, only TypeORM is supported.)
3. **Choose DBML File:** Pick the prepared DBML file from your directory.
4. **Choose Output Folder:** Select the folder where you want to generate the TypeORM configuration code.
5. **Enter Entity Folder Name:** Provide the name of the folder that will contain Entity definitions.
6. **Choose Database Driver:** Select the desired database driver to be used (e.g., Postgres, MySQL, etc.).
7. **Generation Process:** After inputting the required information, press Enter to initiate the code generation process.
8. **Wait for Completion:** Allow the extension to generate the necessary code. It will handle the installation of missing dependencies.

## ✨ Features
- **Rapid Schema Generation:** The main feature of SchemaGenius is to swiftly generate TypeORM Schema definitions from a DBML file.
- **Low Code Approach:** Reduces the need for extensive manual coding by providing a streamlined, low-code approach to schema definition.
- **Dependency Installation:** Automatically installs missing dependencies required for the generated schema code to function correctly.

## 📝 Notes
Suppose you input `entities` for the schema folder name. Two folder will be generated:

- **`entities` Directory**

The `entities` directory contains the generated code for your database schema. This is where you should update relationships (if necessary) and make changes to the generated code.

- **`__entities__` Directory**

The `__entities__` directory should not be modified. This directory defines the database table structure and is meant to be kept consistent with the database schema. Any changes to the table structure should be made in the original DBML source and then regenerated.

The reason for this separation is to maintain consistency in the generated code when working with a DBML file. DBML files are primarily used to generate SQL code, which may not contain information about relationship names. The relationship names are typically defined in the Object Relational Mapping (ORM) code, which is located in the `entities` directory. By adhering to this structure, you can keep your codebase organized and ensure that relationship names are correctly defined in your ORM code.

Remember, when making changes or updates to your database schema, do so in the `entities` directory to maintain consistency and keep the generated code in sync with your ORM.

Happy coding!

## 📝 TODO
**🔧 Support:**
- [x] TypeORM
- [ ] Flask
- [ ] Sequelize
