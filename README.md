## Generating Code from DBML

When running the command above to generate models, two folders will be generated. For instance, if your target directory is `entities`, you will find two directories created: `entities` and `__entities__`. It's essential to understand how to work with these directories to maintain consistency in your generated code.

#### The `entities` Directory

- The `entities` directory contains the generated code for your database schema. This is where you should update relationships (if necessary) and make changes to the generated code.

#### The `__entities__` Directory

- The `__entities__` directory should not be modified. This directory defines the database table structure and is meant to be kept consistent with the database schema. Any changes to the table structure should be made in the original DBML source and then regenerated.

The reason for this separation is to maintain consistency in the generated code when working with a DBML file. DBML files are primarily used to generate SQL code, which may not contain information about relationship names. The relationship names are typically defined in the Object Relational Mapping (ORM) code, which is located in the `entities` directory. By adhering to this structure, you can keep your codebase organized and ensure that relationship names are correctly defined in your ORM code.

Remember, when making changes or updates to your database schema, do so in the `entities` directory to maintain consistency and keep the generated code in sync with your ORM.

Happy coding!

