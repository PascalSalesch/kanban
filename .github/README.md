# @pascalsalesch/kanban

> CLI of a workflow using Kanban and GitHub Flow in semantically versioned software



## Methodologies

- [GitHub-Flow](https://guides.github.com/introduction/flow/)
- [Kanban](https://en.wikipedia.org/wiki/Kanban_(development))
- [Semantic Versioning](https://semver.org/)



## Installation

This package is published at the GitHub Package Registry. To install it, you need to authenticate with GitHub.
You can do this by creating a personal access token (`NODE_AUTH_TOKEN`) and then adding it to your `~/.npmrc` file.

```bash 
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
@pascalsalesch:registry=https://npm.pkg.github.com
```

Then you can install the package with `npm install @pascalsalesch/kanban`.


### `git` Hooks

The raw git hooks can be found in the `hooks` directory. They are used to validate adherence to the workflow.
To use them, you need to copy them to the `.git/hooks` directory of your project.
You will also be asked if it should be done for you if you commit via the `kanban` CLI.


### GitHub Actions Workflow Files

The GitHub Actions Workflow templates can be found in the `workflows` directory. They are used to automate the workflow.
To use them, you should run `kanban` in the root directory of your project and select the "Install the GitHub Actions workflow files" option.



## Workflow


### Prerequisites

- Create Milestones
  - Semantically versioned Software should have Releases for each changelevel.
    - Major: `v1.0.0`
    - Minor: `v1.1.0`
    - Patch: `v1.1.1`
  - GitHub Milestones are already available in GitHub.
- Create Issues
  - Kanban uses Work Items to track progress.
  - GitHub Issues are already available in GitHub.


### Workflow

- Pick an Issue from the Backlog.
  - The Backlog consists of Pull Requests where you are the reviewer and Issues that are not assigned to anyone.
  - Excluded are issues labeled with: `question`, `wontfix`, `duplicate`, `invalid`
  - Issues should be prioritized by the amount reactions
- Assign yourself to Issues that you want to work on.
  - Issues should be assigned to one person.
  - Unassign yourself from Issues that you are not working on.
- Create a new Branch for the Issue.
  - In GitHub Flow you're working on a Branch.
  - The Branch name should consist of three parts, seperated by a dash: `username-changelevel-issue`.
    - The username of the assignee.
    - The changelevel in semver: `major`, `minor`, `patch`.
    - The Issue number, or the word `release` for a release branch.
- Make changes to the code.
  - If you made breaking changes, increase the changelevel in the Branch name.
  - Commit and push your changes to the Branch.
- Create a Pull Request
  - In GitHub Flow changes are reviewed in a Pull Request.
  - At this point the changelevel should be set according to semantic versioning.
  - The milestone should be set according to the changelevel.
  - Assign a reviewer to the Pull Request.


### Release

- Assuming that a Milestone is complete
- Create a new Branch for the Release.
  - The Branch name should consist of three parts, seperated by a dash: `username-changelevel-release`.
    - The username of the assignee.
    - The changelevel in semver: `major`, `minor`, `patch`.
    - The word `release` for a release branch.
  - The changelevel should be determined by the merged Pull Requests.
- Make changes to the code.
  - Increment the version in the `package.json` file.
- Commit and push your changes to the Branch.
- Create a Pull Request
- Merge the Pull Request
  - Close the Milestone
  - Create a new GitHub Release
  - Create new GitHub Milestones
